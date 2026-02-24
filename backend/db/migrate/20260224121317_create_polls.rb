class CreatePolls < ActiveRecord::Migration[7.1]
  def change
    create_table :polls, id: :uuid do |t|
      t.string :question, null: false
      t.string :poll_type, null: false, default: 'multiple_choice'
      t.boolean :is_active, default: true
      t.uuid :owner_id
      t.uuid :slide_id

      t.timestamps
    end

    add_index :polls, :owner_id
    add_foreign_key :polls, :users, column: :owner_id, on_delete: :cascade
  end
end
