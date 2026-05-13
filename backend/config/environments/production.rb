require "active_support/core_ext/integer/time"
require_relative "../secret_key_base_resolver"

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
  config.secret_key_base = SecretKeyBaseResolver.resolve

  if (host = ENV["RAILS_HOST"]).present?
    config.hosts << host
  else
    config.hosts << "slides.rubynor.com"
  end

  # Kamal-proxy health checks use Host: <container-id>:<port> on the Docker network.
  config.hosts << /\A[0-9a-f]+:\d+\z/i

  # Trust X-Forwarded-Proto from the edge proxy so OAuth callback URLs use https.
  config.assume_ssl = ActiveModel::Type::Boolean.new.cast(ENV.fetch("RAILS_ASSUME_SSL", "true"))

  # Live-økt-state (aktiv interaksjon, gjeldende lysbilde, liveboard, spørsmål-svar)
  # ligger i Rails.cache. Uten en delt cache faller alle Puma-arbeidere tilbake til
  # :memory_store pr. prosess — det er årsaken til at "Stopp"-knappen og spørsmål-
  # innsendinger feilet på deploy: kanalen som mottok presentatørens "stop"-melding
  # hadde tom cache fordi aktiveringen ble håndtert av en annen arbeider/container.
  # Vi gjenbruker REDIS_URL som ActionCable allerede er konfigurert med, men holder
  # cache i et eget navnerom så Cable-meldinger og cache-nøkler aldri kolliderer.
  config.cache_store = :redis_cache_store, {
    url: ENV.fetch("REDIS_URL") { "redis://localhost:6379/1" },
    namespace: "proslides_cache",
    expires_in: 12.hours,
    reconnect_attempts: 2,
    error_handler: ->(method:, returning:, exception:) do
      Rails.logger.warn("[cache] #{method} failed: #{exception.class}: #{exception.message}")
    end,
  }
end
