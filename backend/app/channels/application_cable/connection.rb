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
            decoded = JsonWebToken.decode(token)
            if decoded && decoded[:user_id]
                user = User.find_by(id: decoded[:user_id])
                return user if user
            end
        end

        reject_unauthorized_connection
        end
      end
    end
