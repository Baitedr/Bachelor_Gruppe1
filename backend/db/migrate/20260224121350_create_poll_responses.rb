class CreatePollResponses < ActiveRecord::Migration[7.1]
  def change
    create_table :poll_responses, id: :uuid do |t|
      t.references :poll, null: false, foreign_key: true, type: :uuid
      t.uuid :user_id
      t.string :answer, null: false

      t.timestamps
    end

    add_index :poll_responses, :user_id
    add_foreign_key :poll_responses, :users, column: :user_id, on_delete: :nullify
  end
end
