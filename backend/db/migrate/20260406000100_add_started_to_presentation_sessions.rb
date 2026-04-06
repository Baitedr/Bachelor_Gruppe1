class AddStartedToPresentationSessions < ActiveRecord::Migration[8.1]
  def change
    add_column :presentation_sessions, :started, :boolean, default: false, null: false
  end
end
