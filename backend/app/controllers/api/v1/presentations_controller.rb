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
        @presentation.presentation_sessions.where(ended_at: nil).update_all(ended_at: Time.current)
        session = @presentation.presentation_sessions.create!(started_at: Time.current, started: false)
        render json: {
          presentation: presentation_payload(@presentation.reload),
          join_code: session.join_code
        }, status: :ok
      end

      def end_session
        @presentation.update!(is_live: false)
        active_session = @presentation.presentation_sessions.find_by(ended_at: nil)
        active_session&.update!(ended_at: Time.current)
        PresentationChannel.broadcast_to(@presentation, { type: 'session_ended' })
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
          existing_slide_ids = presentation.slides.pluck(:id)
          Poll.where(slide_id: existing_slide_ids).destroy_all if existing_slide_ids.any?
          presentation.slides.destroy_all

          normalized_slides.each_with_index do |slide_data, index|
            source = slide_data.is_a?(ActionController::Parameters) ? slide_data.to_unsafe_h : slide_data
            slide = presentation.slides.create!(
              slide_index: index,
              notes: normalize_slide_notes(source),
              background: normalize_slide_background(slide_data, index)
            )

            create_slide_polls!(slide, slide_data)
          end
        end
      end

      def create_slide_polls!(slide, slide_data)
        source = slide_data.is_a?(ActionController::Parameters) ? slide_data.to_unsafe_h : slide_data
        polls = source['polls'] || source[:polls]
        return unless polls.is_a?(Array) && polls.any?

        polls.each do |poll_data|
          poll_source = poll_data.is_a?(ActionController::Parameters) ? poll_data.to_unsafe_h : poll_data
          question = poll_source['question'] || poll_source[:question]
          next if question.blank?

          poll = slide.polls.create!(
            question: question,
            poll_type: poll_source['pollType'] || poll_source[:pollType] || 'multiple_choice',
            owner_id: current_user.id
          )

          options = poll_source['options'] || poll_source[:options] || []
          options.each do |option_data|
            option_source = option_data.is_a?(ActionController::Parameters) ? option_data.to_unsafe_h : option_data
            text = option_source.is_a?(String) ? option_source : (option_source['text'] || option_source[:text])
            poll.poll_options.create!(text: text) if text.present?
          end
        end
      end

      def default_slide_payload
        {
          'title' => 'Slide 1',
          'content' => '',
          'notes' => '',
          'backgroundColor' => '#ffffff',
          'fabricData' => nil,
          'questions' => []
        }
      end

      def normalize_slide_background(slide_data, index)
        source = slide_data.is_a?(ActionController::Parameters) ? slide_data.to_unsafe_h : slide_data

        {
          title: source['title'].presence || source[:title].presence || "Slide #{index + 1}",
          content: source['content'].to_s.presence || source[:content].to_s.presence || '',
          backgroundColor: source['backgroundColor'].presence || source[:backgroundColor].presence || '#ffffff',
          fabricData: source['fabricData'] || source[:fabricData],
          previewImage: source['previewImage'] || source[:previewImage],
          questions: normalize_slide_questions(source['questions'] || source[:questions])
        }
      end

      def normalize_slide_notes(source)
        (source['notes'] || source[:notes]).to_s
      end

      def normalize_slide_questions(questions)
        return [] unless questions.is_a?(Array)

        questions.filter_map do |question_data|
          question_source = question_data.is_a?(ActionController::Parameters) ? question_data.to_unsafe_h : question_data
          prompt = question_source['prompt'] || question_source[:prompt]
          next if prompt.blank?

          question_type = question_source['type'] || question_source[:type]
          raw_options = question_source['options'] || question_source[:options] || []

          {
            id: question_source['id'] || question_source[:id] || "local-question-#{SecureRandom.hex(6)}",
            prompt: prompt.to_s,
            type: question_type == 'single_choice' ? 'single_choice' : 'open_text',
            required: ActiveModel::Type::Boolean.new.cast(question_source['required'] || question_source[:required]),
            options: normalize_question_options(raw_options),
            createdAt: question_source['createdAt'] || question_source[:createdAt] || Time.current.iso8601
          }
        end
      end

      def normalize_question_options(options)
        return [] unless options.is_a?(Array)

        options.filter_map do |option_data|
          option_source = option_data.is_a?(ActionController::Parameters) ? option_data.to_unsafe_h : option_data
          text = option_source.is_a?(String) ? option_source : (option_source['text'] || option_source[:text])
          next if text.blank?

          {
            id: option_source.is_a?(Hash) ? (option_source['id'] || option_source[:id] || "local-question-option-#{SecureRandom.hex(6)}") : "local-question-option-#{SecureRandom.hex(6)}",
            text: text.to_s
          }
        end
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
        polls = slide.polls.includes(:poll_options, :poll_responses)
        sessions = slide.presentation.presentation_sessions.order(started_at: :desc).to_a
        latest_session = sessions.first

        {
          id: slide.id,
          slideIndex: slide.slide_index,
          title: payload['title'] || "Slide #{slide.slide_index + 1}",
          content: payload['content'] || '',
          notes: slide.notes.presence || payload_value(payload, 'notes') || '',
          backgroundColor: payload['backgroundColor'] || '#ffffff',
          fabricData: payload['fabricData'],
          previewImage: payload_value(payload, 'previewImage'),
          questions: normalize_slide_questions(payload['questions']),
          polls: polls.map { |poll| poll_payload_for_editor(poll, latest_session, sessions) }
        }
      end

      def poll_payload_for_editor(poll, latest_session, sessions)
        latest_counts = counts_for_session(poll, latest_session)

        {
          id: poll.id,
          question: poll.question,
          options: poll.poll_options.map do |option|
            {
              id: option.id,
              text: option.text,
              votes: latest_counts[option.text].to_i
            }
          end,
          latestSessionId: latest_session&.id,
          sessionHistory: sessions.filter_map do |session|
            payload = session_history_payload(poll, session)
            payload if payload[:total] > 0
          end
        }
      end

      def counts_for_session(poll, session)
        return {} unless session

        poll.poll_responses.where(presentation_session_id: session.id).group(:answer).count
      end

      def session_history_payload(poll, session)
        counts = counts_for_session(poll, session)
        total = counts.values.sum

        {
          id: session.id,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          total: total,
          options: poll.poll_options.map do |option|
            {
              id: option.id,
              text: option.text,
              votes: counts[option.text].to_i
            }
          end
        }
      end
    end
  end
end
