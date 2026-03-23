module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate_request!, only: [:me, :logout]

      def register
        user = User.new(auth_params)
        user.password = params[:password]

        if user.save
          token = JsonWebToken.encode(user_id: user.id)
          render json: { token: token, user: user_payload(user) }, status: :created
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def login
        user = User.find_by(email: params[:email].to_s.downcase)

        if user&.authenticate(params[:password])
          token = JsonWebToken.encode(user_id: user.id)
          render json: { token: token, user: user_payload(user) }, status: :ok
        else
          render json: { error: 'Invalid email or password' }, status: :unauthorized
        end
      end

      def omniauth_callback
        auth = request.env['omniauth.auth']
        user = User.from_omniauth(auth)

        if user.persisted?
          token = JsonWebToken.encode(user_id: user.id)
          
          # We redirect to the frontend with the token since this is an OAuth flow
          # Change according to your frontend URL
          frontend_url = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')
          redirect_to "#{frontend_url}/oauth/callback?token=#{token}", allow_other_host: true
        else
          frontend_url = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')
          redirect_to "#{frontend_url}/login?error=oauth_failed", allow_other_host: true
        end
      end

      def omniauth_failure
        frontend_url = ENV.fetch('FRONTEND_URL', 'http://localhost:5173')
        redirect_to "#{frontend_url}/login?error=oauth_failed", allow_other_host: true
      end

      def me
        render json: { user: user_payload(current_user) }, status: :ok
      end

      def logout
        render json: { message: 'Logged out' }, status: :ok
      end

      private

      def auth_params
        params.permit(:email, :name)
      end

      def user_payload(user)
        {
          id: user.id,
          email: user.email,
          name: user.name
        }
      end
    end
  end
end
