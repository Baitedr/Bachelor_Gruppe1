class PresentationSession < ApplicationRecord
  self.table_name = 'presentation_sessions'

  belongs_to :presentation
  has_many :session_participants, foreign_key: :session_id, dependent: :destroy

  before_create :generate_join_code

  private

  def generate_join_code
    loop do
      self.join_code = "LIVE-#{SecureRandom.alphanumeric(4).upcase}"
      break unless PresentationSession.exists?(join_code: join_code)
    end
  end
end
