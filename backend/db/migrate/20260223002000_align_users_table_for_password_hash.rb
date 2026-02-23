class AlignUsersTableForPasswordHash < ActiveRecord::Migration[7.1]
  def up
    add_column :users, :name, :text unless column_exists?(:users, :name)

    if column_exists?(:users, :password_digest) && !column_exists?(:users, :password_hash)
      rename_column :users, :password_digest, :password_hash
    end

    add_column :users, :password_hash, :text unless column_exists?(:users, :password_hash)

    change_column_null :users, :email, false
    change_column_null :users, :password_hash, false

    unless index_exists?(:users, :email, unique: true)
      add_index :users, :email, unique: true, name: 'index_users_on_email_unique'
    end
  end

  def down
    remove_index :users, name: 'index_users_on_email_unique' if index_exists?(:users, name: 'index_users_on_email_unique')

    if column_exists?(:users, :password_hash) && !column_exists?(:users, :password_digest)
      rename_column :users, :password_hash, :password_digest
    end

    remove_column :users, :name if column_exists?(:users, :name)
  end
end
