class SessionParticipant < ApplicationRecord
  self.table_name = 'session_participants'

  belongs_to :presentation_session, class_name: 'PresentationSession', foreign_key: :session_id
  belongs_to :user
end
