module Api
  module V1
    class PollsController < ApplicationController
      before_action :authenticate_request!
      before_action :set_poll, only: [:destroy, :vote]

      # GET /api/v1/polls
      def index
        polls = current_user.polls.includes(:poll_options, :poll_responses)
        render json: { polls: polls.map { |p| poll_payload(p) } }, status: :ok
      end

      # POST /api/v1/polls
      def create
        poll = current_user.polls.new(
          question: poll_params[:question],
          poll_type: poll_params[:poll_type] || 'multiple_choice',
          is_active: true
        )

        poll_params[:options].each do |opt|
          poll.poll_options.build(text: opt)
        end

        if poll.save
          render json: { poll: poll_payload(poll) }, status: :created
        else
          render json: { errors: poll.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/polls/:id
      def destroy
        unless @poll.owner_id == current_user.id
          return render json: { error: 'Unauthorized' }, status: :forbidden
        end

        @poll.destroy
        render json: { message: 'Poll deleted' }, status: :ok
      end

      # POST /api/v1/polls/:id/vote
      def vote
        option = @poll.poll_options.find_by(id: params[:option_id])
        return render json: { error: 'Invalid option' }, status: :unprocessable_entity unless option

        # Prevent double voting
        if @poll.poll_responses.exists?(user: current_user)
          return render json: { error: 'Already voted' }, status: :unprocessable_entity
        end

        response = @poll.poll_responses.create!(
          user: current_user,
          answer: option.text
        )

        render json: { message: 'Vote recorded', poll: poll_payload(@poll.reload) }, status: :ok
      end

      private

      def set_poll
        @poll = Poll.includes(:poll_options, :poll_responses).find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Poll not found' }, status: :not_found
      end

      def poll_params
        params.require(:poll).permit(:question, :poll_type, options: [])
      end

      def poll_payload(poll)
        {
          id: poll.id,
          question: poll.question,
          poll_type: poll.poll_type,
          is_active: poll.is_active,
          created_at: poll.created_at,
          options: poll.poll_options.map do |opt|
            vote_count = poll.poll_responses.count { |r| r.answer == opt.text }
            { id: opt.id, text: opt.text, votes: vote_count }
          end,
          total_votes: poll.poll_responses.count
        }
      end
    end
  end
end