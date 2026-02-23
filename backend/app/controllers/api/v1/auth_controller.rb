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
