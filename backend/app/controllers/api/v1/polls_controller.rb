module Api
  module V1
    class PollsController < ApplicationController
      before_action :authenticate_user!
      before_action :set_poll, only: [:results, :destroy, :vote]

      def index
        polls = Poll.includes(:poll_options, :poll_responses)
                    .where(owner_id: current_user.id)
                    .order(created_at: :desc)

        render json: { polls: polls.map { |poll| poll_payload(poll) } }, status: :ok
      end

      def create
        options = Array(poll_params[:options]).map { |opt| opt.to_s.strip }.reject(&:blank?)
        return render json: { error: 'At least 2 options are required' }, status: :unprocessable_entity if options.size < 2

        poll = Poll.new(
          question: poll_params[:question],
          poll_type: poll_params[:poll_type].presence || 'multiple_choice',
          owner_id: current_user.id
        )

        Poll.transaction do
          poll.save!
          options.each { |text| poll.poll_options.create!(text: text) }
        end

        render json: { poll: poll_payload(poll.reload) }, status: :created
      end

      def destroy
        return render json: { error: 'Unauthorized' }, status: :forbidden unless @poll.owner_id == current_user.id

        @poll.destroy!
        render json: { message: 'Poll deleted' }, status: :ok
      end

      def vote
        option = @poll.poll_options.find_by(id: params[:option_id])
        return render json: { error: 'Invalid option' }, status: :unprocessable_entity unless option

        if @poll.poll_responses.exists?(user_id: current_user.id)
          return render json: { error: 'You have already voted on this poll' }, status: :unprocessable_entity
        end

        @poll.poll_responses.create!(user_id: current_user.id, answer: option.text)

        render json: { poll: poll_payload(@poll.reload) }, status: :ok
      end

      def results
        results = @poll.poll_responses.group(:answer).count
        total = @poll.poll_responses.count

        render json: {
          results: results,
          total: total,
          user_responded: @poll.poll_responses.exists?(user_id: current_user.id)
        }, status: :ok
      end

      private

      def set_poll
        @poll = Poll.includes(:poll_options, :poll_responses).find(params[:id])
      end

      def poll_params
        params.require(:poll).permit(:question, :poll_type, options: [])
      end

      def poll_payload(poll)
        counts = poll.poll_responses.group(:answer).count

        {
          id: poll.id,
          question: poll.question,
          poll_type: poll.poll_type,
          options: poll.poll_options.map do |option|
            {
              id: option.id,
              text: option.text,
              votes: counts[option.text].to_i
            }
          end,
          createdAt: poll.created_at
        }
      end
    end
  end
end