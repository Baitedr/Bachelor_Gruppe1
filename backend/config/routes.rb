Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      get 'health', to: 'health#index'
      get 'slides', to: 'slides#index'

      post 'auth/register', to: 'auth#register'
      post 'auth/login', to: 'auth#login'
      get 'auth/me', to: 'auth#me'
      post 'auth/logout', to: 'auth#logout'

      resources :presentations, only: [:index, :show, :create, :update, :destroy] do
        member do
          post 'start', to: 'presentations#start'
          post 'end_session', to: 'presentations#end_session'
          post 'join', to: 'sessions#join'
          get 'participants', to: 'sessions#participants'
        end
      end

      resources :polls, only: [] do
        member do
          get 'results'
        end
      end
    end
  end

  mount ActionCable.server => '/cable'
end
