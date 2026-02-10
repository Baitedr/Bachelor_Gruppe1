Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get 'health', to: 'health#index'
      resources :items, only: [:index, :show, :create, :update, :destroy]
    end
  end
end
