class AddNotesToSlides < ActiveRecord::Migration[8.1]
  def change
    add_column :slides, :notes, :text, default: '', null: false
  end
end
