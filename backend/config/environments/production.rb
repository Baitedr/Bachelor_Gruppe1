require "active_support/core_ext/integer/time"

Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true
  config.consider_all_requests_local = false
  config.public_file_server.enabled = true

  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::Logger.new($stdout)
    .tap  { |logger| logger.formatter = ::Logger::Formatter.new }
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  config.active_support.report_deprecations = false
  config.secret_key_base = ENV.fetch("SECRET_KEY_BASE")

  if (host = ENV["RAILS_HOST"]).present?
    config.hosts << host
  else
    config.hosts << "slides.rubynor.com"
  end

  # Kamal-proxy health checks use Host: <container-id>:<port> on the Docker network.
  config.hosts << /\A[0-9a-f]+:\d+\z/i
end
