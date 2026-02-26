class Slide < ApplicationRecord
  belongs_to :presentation

  has_many :polls, dependent: :nullify

  validates :slide_index, presence: true
end