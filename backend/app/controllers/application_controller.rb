class ApplicationController < ActionController::API
	private

	def authenticate_request!
		token = request.headers['Authorization']&.split(' ')&.last
		decoded = JsonWebToken.decode(token)
		return render json: { error: 'Unauthorized' }, status: :unauthorized unless decoded

		@current_user = User.find_by(id: decoded[:user_id])
		return render json: { error: 'Unauthorized' }, status: :unauthorized unless @current_user
	end

	def current_user
		@current_user
	end

	def authenticate_user!
		authenticate_request!
	end
end
