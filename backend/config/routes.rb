Rails.application.routes.draw do
  # Kamal-proxy (and load balancers) expect GET /up
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      get 'health', to: 'health#index'
      get 'slides', to: 'slides#index'

      post 'auth/register', to: 'auth#register'
      post 'auth/login', to: 'auth#login'
      get 'auth/me', to: 'auth#me'
      post 'auth/logout', to: 'auth#logout'
      patch 'auth/profile', to: 'auth#update_profile'
      
      # OAuth routes
      get '/auth/:provider/callback', to: 'auth#omniauth_callback'
      post '/auth/:provider/callback', to: 'auth#omniauth_callback'
      get '/auth/failure', to: 'auth#omniauth_failure'

      post 'sessions/guest_join', to: 'sessions#guest_join'
      post 'sessions/join_by_code', to: 'sessions#join_by_code'

      resources :presentations, only: [:index, :show, :create, :update, :destroy] do
        member do
          post 'start', to: 'presentations#start'
          post 'end_session', to: 'presentations#end_session'
          post 'join', to: 'sessions#join'
          get 'participants', to: 'sessions#participants'
        end
      end

      resources :polls, only: [:index, :create, :destroy] do
        member do
          get 'results'
          post 'vote'
        end
      end
    end
  end

  mount ActionCable.server => '/cable' if defined?(ActionCable)

  spa_fallback = lambda do |req|
    next false if req.path.include?("..")
    next false if req.path.start_with?("/api")
    next false if req.path.start_with?("/cable")
    next false if req.path == "/up"
    next false if req.path.start_with?("/rails")

    true
  end

  root to: "spa#index"
  get "*path", to: "spa#index", format: false, constraints: spa_fallback
end
