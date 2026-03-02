class AddJoinCodeToPresentationSessions < ActiveRecord::Migration[8.1]
  def change
    add_column :presentation_sessions, :join_code, :string
    add_index :presentation_sessions, :join_code, unique: true
  end
end
