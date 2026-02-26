Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get 'health', to: 'health#index'
      get 'slides', to: 'slides#index'
      post 'auth/register', to: 'auth#register'
      post 'auth/login', to: 'auth#login'
      get 'auth/me', to: 'auth#me'
      post 'auth/logout', to: 'auth#logout'
    end
  end
end

  mount ActionCable.server => '/cable'
end
