Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get 'health', to: 'health#index'
      get 'slides', to: 'slides#index'
    end
  end
end
