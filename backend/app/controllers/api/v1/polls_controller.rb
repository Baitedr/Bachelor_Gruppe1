module Api
    module V1
        class PollsController < ApplicationController
            before_action :authenticate_user!

            def results
                poll = Poll.find(params[:id])
                results = poll.poll_responses.group(:answer).count
                total = poll.poll_responses.count

                render json: {
                    results: results,
                    total: total,
                    user_responded: poll.poll_responses.exists?(user_id: @current_user.id)
                }
            end
        end
    end
end