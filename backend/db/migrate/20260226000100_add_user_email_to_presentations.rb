class AddUserEmailToPresentations < ActiveRecord::Migration[8.1]
  def up
    add_column :presentations, :user_email, :text
    add_index :presentations, :user_email

    execute <<~SQL
      UPDATE presentations
      SET user_email = users.email
      FROM users
      WHERE presentations.owner_id = users.id
    SQL

    change_column_null :presentations, :user_email, false
  end

  def down
    remove_index :presentations, :user_email
    remove_column :presentations, :user_email
  end
end
