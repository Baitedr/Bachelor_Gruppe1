class AddUpdatedAtToPresentations < ActiveRecord::Migration[8.1]
  def up
    add_column :presentations, :updated_at, :datetime, precision: nil
    execute('UPDATE presentations SET updated_at = created_at WHERE updated_at IS NULL')
    change_column_null :presentations, :updated_at, false
    change_column_default :presentations, :updated_at, -> { 'CURRENT_TIMESTAMP' }
  end

  def down
    remove_column :presentations, :updated_at
  end
end
