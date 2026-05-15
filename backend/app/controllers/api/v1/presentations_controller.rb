module Api
  module V1
    class PresentationsController < ApplicationController
      before_action :authenticate_request!
      before_action :set_owned_presentation, only: [:show, :update, :destroy, :start, :end_session]

      def index
        presentations = current_user.presentations
                                    .includes(:slides)
                                    .order(created_at: :desc)
                                    .limit(limit_param)

        render json: {
          presentations: presentations.map { |presentation| PresentationSerializer.summary(presentation) }
        }, status: :ok
      end

      def show
        render json: { presentation: PresentationSerializer.one(@presentation) }, status: :ok
      end

      def create
        presentation = current_user.presentations.create!(
          title: title_param,
          user_email: current_user.email
        )
        replace_slides(presentation, touch_updated_at: false)
        PresentationChannel.invalidate_questions_lookup_cache(presentation.id)

        render json: { presentation: PresentationSerializer.one(presentation.reload) }, status: :created
      end

      def update
        @presentation.update!(
          title: title_param,
          user_email: current_user.email
        )
        replace_slides(@presentation)
        PresentationChannel.invalidate_questions_lookup_cache(@presentation.id)

        render json: { presentation: PresentationSerializer.one(@presentation.reload) }, status: :ok
      end

      def destroy
        PresentationChannel.invalidate_questions_lookup_cache(@presentation.id)
        PresentationChannel.invalidate_active_session_cache(@presentation.id)
        @presentation.destroy!
        render json: { message: 'Presentation deleted' }, status: :ok
      end

      def start
        @presentation.update!(is_live: true)
        @presentation.presentation_sessions.where(ended_at: nil).update_all(ended_at: Time.current)
        session = @presentation.presentation_sessions.create!(started_at: Time.current, started: false)
        PresentationChannel.invalidate_active_session_cache(@presentation.id)
        render json: {
          presentation: PresentationSerializer.one(@presentation.reload),
          join_code: session.join_code
        }, status: :ok
      end

      def end_session
        @presentation.update!(is_live: false)
        active_session = @presentation.presentation_sessions.find_by(ended_at: nil)
        if active_session
          active_session.update!(ended_at: Time.current)
          delete_guest_users_from_session(active_session)
        end
        PresentationChannel.invalidate_active_session_cache(@presentation.id)
        safe_broadcast(@presentation, { type: 'session_ended' })
        render json: { presentation: PresentationSerializer.one(@presentation.reload) }, status: :ok
      end

      private

      def set_owned_presentation
        @presentation = current_user.presentations.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Presentation not found' }, status: :not_found
      end

      def delete_guest_users_from_session(session)
        session.session_participants.each do |participant|
          user = participant.user
          user.destroy if user.email.end_with?('@guest.proslides')
        end
      end

      def limit_param
        raw_limit = params[:limit].to_i
        return 10 if raw_limit <= 0

        [raw_limit, 50].min
      end

      def title_param
        params.dig(:presentation, :title).presence || 'Untitled Presentation'
      end

      def slides_payload
        payload = params.dig(:presentation, :slides)
        return [] unless payload.is_a?(Array)

        payload
      end

      def presentation_variables_payload
        SlidePayloadNormalizer.normalize_presentation_variables(params.dig(:presentation, :variables))
      end

      def replace_slides(presentation, touch_updated_at: true)
        Presentations::ReplaceSlidesService.call(
          presentation: presentation,
          slides: slides_payload,
          variables: params.dig(:presentation, :variables),
          owner_id: current_user.id,
          touch_updated_at: touch_updated_at
        )
      end

      def safe_broadcast(presentation, payload)
        PresentationChannel.broadcast_to(presentation, payload)
      rescue StandardError => e
        Rails.logger.warn(
          "[presentations#safe_broadcast] failed presentation_id=#{presentation.id} " \
          "event=#{payload[:type] || payload['type']} error=#{e.class}: #{e.message}"
        )
      end
    end
  end
end
