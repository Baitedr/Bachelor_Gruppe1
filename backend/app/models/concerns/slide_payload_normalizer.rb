module SlidePayloadNormalizer
  module_function

  def default_slide_payload
    {
      'title' => 'Slide 1',
      'content' => '',
      'notes' => '',
      'backgroundColor' => '#ffffff',
      'fabricData' => nil,
      'questions' => [],
      'variables' => []
    }
  end

  def normalize_slide_background(slide_data, index, shared_variables = [])
    source = unwrap_hash(slide_data)

    {
      title: source['title'].presence || source[:title].presence || "Slide #{index + 1}",
      content: source['content'].to_s.presence || source[:content].to_s.presence || '',
      backgroundColor: source['backgroundColor'].presence || source[:backgroundColor].presence || '#ffffff',
      fabricData: source['fabricData'] || source[:fabricData],
      previewImage: source['previewImage'] || source[:previewImage],
      questions: normalize_slide_questions(source['questions'] || source[:questions]),
      variables: normalize_presentation_variables(source['variables'] || source[:variables] || shared_variables)
    }
  end

  def normalize_slide_notes(source)
    (source['notes'] || source[:notes]).to_s
  end

  def normalize_presentation_variables(variables)
    return [] unless variables.is_a?(Array)

    variables.filter_map do |variable_data|
      source = unwrap_hash(variable_data)
      name = (source['name'] || source[:name]).to_s.strip
      next if name.blank?

      {
        id: (source['id'] || source[:id] || "var-#{SecureRandom.hex(6)}").to_s,
        name: name,
        value: (source['value'] || source[:value]).to_s
      }
    end
  end

  def normalize_slide_questions(questions)
    return [] unless questions.is_a?(Array)

    questions.filter_map do |question_data|
      question_source = unwrap_hash(question_data)
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
      option_source = unwrap_hash(option_data)
      text = option_source.is_a?(String) ? option_source : (option_source['text'] || option_source[:text])
      next if text.blank?

      {
        id: option_source.is_a?(Hash) ? (option_source['id'] || option_source[:id] || "local-question-option-#{SecureRandom.hex(6)}") : "local-question-option-#{SecureRandom.hex(6)}",
        text: text.to_s
      }
    end
  end

  def unwrap_hash(value)
    value.is_a?(ActionController::Parameters) ? value.to_unsafe_h : value
  end
end
