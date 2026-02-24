class User < ApplicationRecord
  attr_accessor :password

  has_many :polls, foreign_key: :owner_id, dependent: :destroy

  validates :email, presence: true, uniqueness: { case_sensitive: false }
  validates :password, presence: true, on: :create

  before_validation :normalize_email
  before_save :hash_password, if: -> { password.present? }

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
