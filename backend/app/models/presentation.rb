class Presentation < ApplicationRecord
  belongs_to :owner, class_name: 'User'

  has_many :slides, -> { order(:slide_index) }, dependent: :destroy
  has_many :presentation_sessions, dependent: :destroy

  validates :title, presence: true
end