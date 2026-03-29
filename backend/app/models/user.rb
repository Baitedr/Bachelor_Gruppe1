class User < ApplicationRecord
  attr_accessor :password

  has_many :polls, foreign_key: :owner_id, dependent: :destroy
  has_many :presentations, foreign_key: :owner_id, dependent: :destroy

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  PASSWORD_COMPLEXITY = /\A(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+\z/

  validates :password,
            presence: true,
            length: { minimum: 8 },
            format: { with: PASSWORD_COMPLEXITY, message: "er ikke gyldig" },
            on: :create,
            unless: :oauth_user?

  validates :password,
            presence: true,
            length: { minimum: 8 },
            format: { with: PASSWORD_COMPLEXITY, message: "er ikke gyldig" },
            on: :password_change

  before_validation :normalize_email
  before_save :hash_password, if: -> { password.present? }

  def oauth_user?
    oauth_provider.present? && oauth_uid.present?
  end

  def self.email_from_omniauth(auth)
    info = auth.info
    email = info&.email.to_s.strip.downcase.presence
    return email if email.present?

    raw = auth.extra&.dig(:raw_info)
    if raw.respond_to?(:[])
      nested = raw[:email].presence || raw["email"].presence
      return nested.to_s.strip.downcase if nested.present?
    end

    nil
  end

  def self.from_omniauth(auth)
    email = email_from_omniauth(auth)
    unless email.present?
      user = new
      user.errors.add(:base, "Kunne ikke hente e-post fra leverandøren (sjekk at kontoen har synlig e-post).")
      return user
    end

    provider = auth.provider.to_s
    uid = auth.uid.to_s

    user = find_by(oauth_provider: provider, oauth_uid: uid)
    return user if user

    existing = find_by(email: email)
    if existing
      existing.update!(
        oauth_provider: provider,
        oauth_uid: uid,
        oauth_avatar_url: auth.info&.image,
        name: existing.name.presence || auth.info&.name
      )
      existing
    else
      create!(
        email: email,
        name: auth.info&.name.presence || email.split("@").first,
        oauth_provider: provider,
        oauth_uid: uid,
        oauth_avatar_url: auth.info&.image,
        password: SecureRandom.hex(16)
      )
    end
  rescue ActiveRecord::RecordInvalid => e
    e.record
  end

  def authenticate(raw_password)
    return false if raw_password.blank?

    stored_hash =
      if has_attribute?(:password_hash)
        self[:password_hash]
      elsif has_attribute?(:password_digest)
        self[:password_digest]
      end

    stored_hash = stored_hash.presence
    return false if stored_hash.blank?

    BCrypt::Password.new(stored_hash).is_password?(raw_password) ? self : false
  rescue BCrypt::Errors::InvalidHash
    false
  end

  private

  def normalize_email
    self.email = email.to_s.downcase
  end

  def hash_password
    encrypted_password = BCrypt::Password.create(password)

    if has_attribute?(:password_hash)
      self[:password_hash] = encrypted_password
    else
      self[:password_digest] = encrypted_password
    end
  end
end
