require "active_support/core_ext/integer/time"
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
end
