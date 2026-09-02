sed -i -e '/<div class="form-row">/,/<\/div>/{
    /<div class="form-group">/,/<\/div>/{
        /Số lượng nhân sự trực chính mặc định/b remove
        /Số lượng nhân sự dự phòng mặc định/b remove
    }
}' templates/index.html
