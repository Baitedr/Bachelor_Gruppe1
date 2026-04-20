module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user

    # Når en klient kobler til WebSocket, prøver vi å autentisere brukeren basert på en token som sendes i forespørselen.
    def connect 
        self.current_user = find_verified_user
    end

    private

    # Hjelpemetode for å finne og verifisere brukeren basert på en token som sendes i forespørselen.
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
