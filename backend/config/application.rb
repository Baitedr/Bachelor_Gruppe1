require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_job/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'action_view/railtie'
require 'action_cable/engine'

Bundler.require(*Rails.groups)

module Backend
  class Application < Rails::Application
    config.load_defaults 7.1
    config.api_only = true

    
    if Rails.env.production?
      config.middleware.insert_before 0, ActionDispatch::Static, Rails.public_path.to_s
    end

  
    config.session_store :cookie_store,
      key: '_proslides_session',
      same_site: :lax,
      secure: Rails.env.production?,
      httponly: true
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use config.session_store, config.session_options

  
    config.database_connection_pool_size = 10

    
    if Rails.env.production?
      config.eager_load_paths += %W(#{config.root}/app/models)
    end
    
   
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins(
          ENV.fetch('ALLOWED_ORIGINS', 'http://localhost:5173').split(',').map(&:strip)
        )
        resource '*',
          headers: :any,
          methods: [:get, :post, :put, :patch, :delete, :options, :head],
          credentials: true
      end
    end

    config.action_cable.mount_path = '/cable'
    config.action_cable.disable_request_forgery_protection = true
  end 
end
