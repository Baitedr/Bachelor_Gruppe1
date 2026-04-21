class RemoveUnusedDatabaseStructures < ActiveRecord::Migration[7.0]
  def change
    # Drop unused tables
    drop_table :refresh_tokens, if_exists: true
    drop_table :roles, if_exists: true
    drop_table :slide_elements, if_exists: true

    # Remove unused columns from users table
    remove_column :users, :reset_password_token_digest, :string, if_exists: true
    remove_column :users, :reset_password_sent_at, :datetime, if_exists: true
  end
end
