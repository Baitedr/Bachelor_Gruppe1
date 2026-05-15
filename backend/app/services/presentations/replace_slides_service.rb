module Presentations
  class ReplaceSlidesService
    def self.call(presentation:, slides:, variables:, owner_id:, touch_updated_at: true)
      new(
        presentation: presentation,
        slides: slides,
        variables: variables,
        owner_id: owner_id,
        touch_updated_at: touch_updated_at
      ).call
    end

    def initialize(presentation:, slides:, variables:, owner_id:, touch_updated_at: true)
      @presentation = presentation
      @slides = slides
      @variables = variables
      @owner_id = owner_id
      @touch_updated_at = touch_updated_at
    end

    def call
      normalized_slides = @slides.empty? ? [SlidePayloadNormalizer.default_slide_payload] : @slides
      shared_variables = SlidePayloadNormalizer.normalize_presentation_variables(@variables)

      Presentation.transaction do
        existing_slide_ids = @presentation.slides.pluck(:id)
        Poll.where(slide_id: existing_slide_ids).destroy_all if existing_slide_ids.any?
        @presentation.slides.destroy_all

        normalized_slides.each_with_index do |slide_data, index|
          source = SlidePayloadNormalizer.unwrap_hash(slide_data)
          slide = @presentation.slides.create!(
            slide_index: index,
            notes: SlidePayloadNormalizer.normalize_slide_notes(source),
            background: SlidePayloadNormalizer.normalize_slide_background(slide_data, index, shared_variables)
          )

          create_slide_polls!(slide, slide_data)
        end

        @presentation.touch if @touch_updated_at
      end
    end

    private

    def create_slide_polls!(slide, slide_data)
      source = SlidePayloadNormalizer.unwrap_hash(slide_data)
      polls = source['polls'] || source[:polls]
      return unless polls.is_a?(Array) && polls.any?

      polls.each do |poll_data|
        poll_source = SlidePayloadNormalizer.unwrap_hash(poll_data)
        question = poll_source['question'] || poll_source[:question]
        next if question.blank?

        poll = slide.polls.create!(
          question: question,
          poll_type: poll_source['pollType'] || poll_source[:pollType] || 'multiple_choice',
          owner_id: @owner_id
        )

        options = poll_source['options'] || poll_source[:options] || []
        options.each do |option_data|
          option_source = SlidePayloadNormalizer.unwrap_hash(option_data)
          text = option_source.is_a?(String) ? option_source : (option_source['text'] || option_source[:text])
          poll.poll_options.create!(text: text) if text.present?
        end
      end
    end
  end
end
