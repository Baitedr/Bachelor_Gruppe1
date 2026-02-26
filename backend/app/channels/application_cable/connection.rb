module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    def connect 
        self.current_user = find_verified_user
    end

    private

    def find_verified_user
        token = request.params[:token]

        if token.present?
            begin 
                decoded = JWT.decode(token, Rails.application.credentials.secret_key_base, true, { algorithm: 'HS256' })
                user = User.find_by(id: decoded[0]['user_id'])
                return user if user
            rescue JWT::DecodeError, JWT::ExpiredSignature
                reject_unauthorized_connection
            end
        end

        reject_unauthorized_connection
        end
      end
    end
