require "active_support/core_ext/integer/time"
require "active_support/core_ext/numeric/bytes"
require_relative "../secret_key_base_resolver"

Rails.application.configure do
  config.secret_key_base = SecretKeyBaseResolver.resolve

  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true
  config.server_timing = true
  config.active_support.deprecation = :log
  config.active_support.disallowed_deprecation = :raise
  config.active_support.disallowed_deprecation_warnings = []

  # Aktiv interaksjonsstate i live-økten lever i Rails.cache. I dev bruker vi
  # memory_store så vi får samme oppførsel som prod uten å kreve Redis lokalt.
  # I prod (se production.rb) bruker vi redis_cache_store av samme grunn —
  # delt mellom Puma-arbeidere/containere.
  config.cache_store = :memory_store, { size: 64 * 1024 * 1024 }
end
