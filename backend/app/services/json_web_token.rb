class JsonWebToken
  def self.encode(payload, exp = 24.hours.from_now)
    payload[:exp] = exp.to_i
    JWT.encode(payload, secret_key, 'HS256')
  end

  def self.decode(token)
    return nil if token.blank?

    body = JWT.decode(token, secret_key, true, { algorithm: 'HS256' })[0]
    body.with_indifferent_access
  rescue JWT::DecodeError, JWT::ExpiredSignature
    nil
  end

  def self.secret_key
    jwt = ENV["JWT_SECRET_KEY"].to_s.strip
    return jwt if jwt.present?

    Rails.application.secret_key_base
  end
end
