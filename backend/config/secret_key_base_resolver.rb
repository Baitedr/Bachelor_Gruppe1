# frozen_string_literal: true

require "digest/sha2"

# Kamal/production: set SECRET_KEY_BASE in the environment (see config/deploy.yml secrets).
# Local dev: non-blank .env value wins; else optional credentials; else a stable derived dev key.
module SecretKeyBaseResolver
  module_function

  def resolve
    env_val = ENV["SECRET_KEY_BASE"].to_s.strip
    return env_val unless env_val.empty?

    creds_val = Rails.application.credentials.secret_key_base
    if creds_val.is_a?(String) && !(s = creds_val.strip).empty?
      return s
    end

    if Rails.env.production?
      raise ArgumentError,
            "SECRET_KEY_BASE must be set in production (Kamal injects it from backend/.env). " \
            "Generate a key with: bin/rails secret"
    end

    Digest::SHA256.hexdigest("#{Rails.root}/proslides-dev-secret-key-base-v1")
  end
end
