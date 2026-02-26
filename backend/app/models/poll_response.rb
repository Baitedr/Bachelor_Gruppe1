class PollResponse < ApplicationRecord
  belongs_to :poll
  belongs_to :user, optional: true

  validates :answer, presence: true
end