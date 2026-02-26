class Presentation < ApplicationRecord
  belongs_to :owner, class_name: 'User'

  has_many :slides, -> { order(:slide_index) }, dependent: :destroy
  has_many :presentation_sessions, dependent: :destroy

  validates :title, presence: true
  validates :user_email, presence: true

  before_validation :sync_user_email_from_owner

  private

  def sync_user_email_from_owner
    self.user_email = owner&.email
  end
end