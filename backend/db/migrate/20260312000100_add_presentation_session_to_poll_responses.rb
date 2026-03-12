class AddPresentationSessionToPollResponses < ActiveRecord::Migration[8.1]
  def change
    add_reference :poll_responses,
                  :presentation_session,
                  type: :uuid,
                  foreign_key: true,
                  index: true

    add_index :poll_responses,
              [:poll_id, :user_id, :presentation_session_id],
              unique: true,
              name: 'index_poll_responses_on_poll_user_session'
  end
end