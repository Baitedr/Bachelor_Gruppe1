Rails.application.config.middleware.use OmniAuth::Builder do
  configure do |config|
    config.path_prefix = '/api/v1/auth'
  end

  if ENV['GOOGLE_CLIENT_ID'].present? && ENV['GOOGLE_CLIENT_SECRET'].present?
    provider :google_oauth2, ENV['GOOGLE_CLIENT_ID'], ENV['GOOGLE_CLIENT_SECRET'], {
      prompt: 'select_account',
      image_aspect_ratio: 'square',
      image_size: 50
    }
  end

  if ENV['GITHUB_CLIENT_ID'].present? && ENV['GITHUB_CLIENT_SECRET'].present?
    provider :github, ENV['GITHUB_CLIENT_ID'], ENV['GITHUB_CLIENT_SECRET'], scope: 'user:email'
  end
end

# Resolve OmniAuth and CSRF issues in API mode
OmniAuth.config.allowed_request_methods = [:post, :get]
OmniAuth.config.silence_get_warning = true

if ENV['OMNIAUTH_FULL_HOST'].present?
  OmniAuth.config.full_host = ENV['OMNIAUTH_FULL_HOST'].to_s.chomp('/')
end
