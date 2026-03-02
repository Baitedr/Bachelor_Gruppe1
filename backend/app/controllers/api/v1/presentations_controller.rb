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
          presentations: presentations.map { |presentation| presentation_summary(presentation) }
        }, status: :ok
      end

      def show
        render json: { presentation: presentation_payload(@presentation) }, status: :ok
      end

      def create
        presentation = current_user.presentations.create!(
          title: title_param,
          user_email: current_user.email
        )
        replace_slides!(presentation, slides_payload)

        render json: { presentation: presentation_payload(presentation.reload) }, status: :created
      end

      def update
        @presentation.update!(
          title: title_param,
          user_email: current_user.email
        )
        replace_slides!(@presentation, slides_payload)

        render json: { presentation: presentation_payload(@presentation.reload) }, status: :ok
      end

      def destroy
        @presentation.destroy!
        render json: { message: 'Presentation deleted' }, status: :ok
      end

      def start
        @presentation.update!(is_live: true)
        session = @presentation.presentation_sessions.create!(started_at: Time.current)
        render json: {
          presentation: presentation_payload(@presentation.reload),
          join_code: session.join_code
        }, status: :ok
      end

      def end_session
        @presentation.update!(is_live: false)
        active_session = @presentation.presentation_sessions.find_by(ended_at: nil)
        active_session&.update!(ended_at: Time.current)
        render json: { presentation: presentation_payload(@presentation.reload) }, status: :ok
      end

      private

      def set_owned_presentation
        @presentation = current_user.presentations.find(params[:id])
      rescue ActiveRecord::RecordNotFound
        render json: { error: 'Presentation not found' }, status: :not_found
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

      def replace_slides!(presentation, slides)
        normalized_slides = if slides.empty?
                              [default_slide_payload]
                            else
                              slides
                            end

        Presentation.transaction do
          presentation.slides.destroy_all

          normalized_slides.each_with_index do |slide_data, index|
            presentation.slides.create!(
              slide_index: index,
              background: normalize_slide_background(slide_data, index)
            )
          end
        end
      end

      def default_slide_payload
        {
          'title' => 'Slide 1',
          'content' => '',
          'backgroundColor' => '#ffffff',
          'fabricData' => nil
        }
      end

      def normalize_slide_background(slide_data, index)
        source = slide_data.is_a?(ActionController::Parameters) ? slide_data.to_unsafe_h : slide_data

        {
          title: source['title'].presence || source[:title].presence || "Slide #{index + 1}",
          content: source['content'].to_s.presence || source[:content].to_s.presence || '',
          backgroundColor: source['backgroundColor'].presence || source[:backgroundColor].presence || '#ffffff',
          fabricData: source['fabricData'] || source[:fabricData],
          previewImage: source['previewImage'] || source[:previewImage]
        }
      end

      def presentation_summary(presentation)
        first_slide = presentation.slides.first

        {
          id: presentation.id,
          title: presentation.title,
          user_email: presentation.user_email,
          created_at: presentation.created_at,
          is_live: presentation.is_live,
          slide_count: presentation.slides.size,
          first_slide: first_slide_preview(first_slide)
        }
      end

      def first_slide_preview(slide)
        return nil unless slide

        payload = slide.background.is_a?(Hash) ? slide.background : {}
        {
          title: payload_value(payload, 'title') || 'Slide 1',
          content: payload_value(payload, 'content') || '',
          backgroundColor: payload_value(payload, 'backgroundColor') || '#ffffff',
          previewImage: payload_value(payload, 'previewImage')
        }
      end

      def payload_value(payload, key)
        payload[key] || payload[key.to_sym]
      end

      def presentation_payload(presentation)
        {
          id: presentation.id,
          title: presentation.title,
          user_email: presentation.user_email,
          created_at: presentation.created_at,
          is_live: presentation.is_live,
          slides: presentation.slides.order(:slide_index).map { |slide| slide_payload(slide) }
        }
      end

      def slide_payload(slide)
        payload = slide.background.is_a?(Hash) ? slide.background : {}

        {
          id: slide.id,
          slideIndex: slide.slide_index,
          title: payload['title'] || "Slide #{slide.slide_index + 1}",
          content: payload['content'] || '',
          backgroundColor: payload['backgroundColor'] || '#ffffff',
          fabricData: payload['fabricData']
        }
      end
    end
  end
end
