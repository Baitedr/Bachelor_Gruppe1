class User < ApplicationRecord
  attr_accessor :password

  has_many :polls, foreign_key: :owner_id, dependent: :destroy
  has_many :presentations, foreign_key: :owner_id, dependent: :destroy

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :password, presence: true, 
            length: { minimum: 8 }, 
            format: { 
              with: /\A(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+\z/,
              message: "must contain at least one lowercase letter, one uppercase letter, and one digit"
            },
            on: :create, unless: :oauth_user?

  before_validation :normalize_email
  before_save :hash_password, if: -> { password.present? }

  def oauth_user?
    has_attribute?(:provider) && provider.present? && uid.present?
  end

  def self.from_omniauth(auth)
    where(email: auth.info.email).first_or_create do |user|
      user.email = auth.info.email
      # If your users table has provider and uid columns, uncomment these:
      # user.provider = auth.provider
      # user.uid = auth.uid
      
      # We just set a random password for users created via OAuth
      # to bypass password validations if we don't have oauth_user? field.
      user.password = SecureRandom.hex(16)
    end
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
