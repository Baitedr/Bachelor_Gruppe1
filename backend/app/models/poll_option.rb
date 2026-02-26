class PollOption < ApplicationRecord
  belongs_to :poll

  validates :text, presence: true
end