class PresentationSession < ApplicationRecord
  self.table_name = 'presentation_sessions'

  belongs_to :presentation
  has_many :session_participants, foreign_key: :session_id, dependent: :destroy
end
