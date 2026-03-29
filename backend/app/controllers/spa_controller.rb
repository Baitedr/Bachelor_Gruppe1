class SpaController < ActionController::API
  def index
    path = Rails.public_path.join("index.html")
    return head :not_found unless path.file?

    render html: path.read.html_safe, layout: false, content_type: "text/html"
  end
end
