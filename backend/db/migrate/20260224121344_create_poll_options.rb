class CreatePollOptions < ActiveRecord::Migration[7.1]
  def change
    create_table :poll_options, id: :uuid do |t|
      t.references :poll, null: false, foreign_key: true, type: :uuid
      t.string :text, null: false

      t.timestamps
    end
  end
end
