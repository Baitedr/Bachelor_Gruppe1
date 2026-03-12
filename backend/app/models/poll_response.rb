class PollResponse < ApplicationRecord
  belongs_to :poll
  belongs_to :user, optional: true
  belongs_to :presentation_session, optional: true

  validates :answer, presence: true
end