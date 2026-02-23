require_relative 'boot'

require 'rails'
require 'active_model/railtie'
require 'active_job/railtie'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'action_view/railtie'

Bundler.require(*Rails.groups)

module Backend
  class Application < Rails::Application
    config.load_defaults 7.1
    config.api_only = true

    # Optimize database connection pool for cold-start requests
    # Increase from default 5 to handle better concurrency under load
    config.database_connection_pool_size = 10

    # Eager load models in production to avoid cold-start penalties on first requests
    if Rails.env.production?
      config.eager_load_paths += %W(#{config.root}/app/models)
    end
    
    # CORS configuration
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins 'http://localhost:5173' # React dev server
        resource '*',
          headers: :any,
          methods: [:get, :post, :put, :patch, :delete, :options, :head],
          credentials: true
      end
    end
  end
end
