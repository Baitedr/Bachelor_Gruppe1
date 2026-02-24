class Poll < ApplicationRecord
  belongs_to :slide, optional: true
  belongs_to :user, foreign_key: :owner_id, optional: true
  has_many :poll_options, dependent: :destroy
  has_many :poll_responses, dependent: :destroy

  validates :question, presence: true
  validates :poll_type, presence: true

  accepts_nested_attributes_for :poll_options
end