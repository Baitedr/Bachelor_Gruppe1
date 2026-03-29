module Api
  module V1
    class AuthController < ApplicationController
      before_action :authenticate_request!, only: [:me, :logout, :update_profile, :change_password]

      def register
        user = User.new(auth_params)

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
        unless auth
          return redirect_to oauth_failure_redirect, allow_other_host: true
        end

        user = User.from_omniauth(auth)

        if user.persisted? && user.errors.empty?
          token = JsonWebToken.encode(user_id: user.id)
          redirect_to "#{oauth_frontend_base}/oauth/callback?#{Rack::Utils.build_query(token: token)}",
                      allow_other_host: true
        else
          redirect_to oauth_failure_redirect, allow_other_host: true
        end
      end

      def omniauth_failure
        redirect_to oauth_failure_redirect, allow_other_host: true
      end

      def me
        render json: { user: user_payload(current_user) }, status: :ok
      end

      def logout
        render json: { message: 'Logged out' }, status: :ok
      end

      def update_profile
        if current_user.update(profile_params)
          render json: { user: user_payload(current_user) }, status: :ok
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def change_password
        p = password_change_params
        if p[:password].blank? || p[:password] != p[:password_confirmation]
          return render json: { errors: ['Passord og bekreftelse stemmer ikke, eller passord mangler.'] },
                        status: :unprocessable_entity
        end

        unless current_user.oauth_user?
          unless current_user.authenticate(p[:current_password].to_s)
            return render json: { error: 'Nåværende passord er feil.' }, status: :unauthorized
          end
        end

        current_user.password = p[:password]
        if current_user.save(context: :password_change)
          render json: { message: 'Passord oppdatert.', user: user_payload(current_user) }, status: :ok
        else
          render json: { errors: current_user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def oauth_frontend_base
        ENV.fetch('FRONTEND_URL', 'http://localhost:5173').to_s.chomp('/')
      end

      def oauth_failure_redirect
        "#{oauth_frontend_base}/login?error=oauth_failed"
      end

      def auth_params
        # Allow nested :auth params (due to wrap_parameters) or root level params
        if params[:auth]
          params.require(:auth).permit(:email, :name, :password)
        else
          params.permit(:email, :name, :password)
        end
      end

      def user_payload(user)
        {
          id: user.id,
          email: user.email,
          name: user.name,
          oauth_user: user.oauth_user?
        }
      end

      def profile_params
        params.permit(:name)
      end

      def password_change_params
        if params[:password_change]
          params.require(:password_change).permit(:current_password, :password, :password_confirmation)
        else
          params.permit(:current_password, :password, :password_confirmation)
        end
      end
    end
  end
end
